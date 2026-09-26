import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import * as xlsxModule from 'xlsx';
import type { WorkBook } from 'xlsx';
import { buildExcelWorkbook, parseExcelWorkbook, buildBlankExcelTemplate, buildUsersExcelWorkbook } from './src/utils/excelWorkbook';
import { DEFAULT_SETTINGS, getInitialExpenses, generate5DigitMemberId } from './src/utils/initialData';
import { normalizePayerId } from './src/utils/calculations';
import type { AppSettings } from './src/types';

// Safe XLSX reference for both ESM and CJS
const XLSX = (xlsxModule as any).default || xlsxModule;

interface StoredUser {
  id: string;
  name: string;
  role: 'main' | 'member';
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastModified: string;
}

function hashPassword(password: string, existingSalt?: string): { hash: string; salt: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
  return { hash, salt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
  return computed === hash;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parser with generous payload limit
  app.use(express.json({ limit: '15mb' }));

  // Excel database location
  const DATA_DIR = path.join(process.cwd(), 'data');
  const EXCEL_FILE_PATH = path.join(DATA_DIR, 'expenses.xlsx');
  const USERS_FILE_PATH = path.join(DATA_DIR, 'users.xlsx');

  // Real-time synchronization version trackers
  let expensesVersion = Date.now();
  let usersVersion = Date.now();

  // Ensure data folder exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Safe buffer-based Excel file operations for expenses
  function readExcelDatabaseFile(): WorkBook {
    const buffer = fs.readFileSync(EXCEL_FILE_PATH);
    return XLSX.read(buffer, { type: 'buffer' });
  }

  function writeExcelDatabaseFile(wb: WorkBook) {
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const tmpPath = `${EXCEL_FILE_PATH}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, EXCEL_FILE_PATH);
    expensesVersion = Date.now();

    // Keep users.xlsx Members and Summary sheets synchronized
    try {
      const users = readUsersExcelFile();
      if (users && users.length > 0) {
        const parsed = parseExcelWorkbook(wb, getEffectiveDefaultSettings());
        const usersWb = buildUsersExcelWorkbook(users, parsed);
        const uBuffer = XLSX.write(usersWb, { type: 'buffer', bookType: 'xlsx' });
        const uTmpPath = `${USERS_FILE_PATH}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
        fs.writeFileSync(uTmpPath, uBuffer);
        fs.renameSync(uTmpPath, USERS_FILE_PATH);
        usersVersion = Date.now();
      }
    } catch (syncUsersErr) {
      console.warn('[Users Storage Sync Notice]', syncUsersErr);
    }
  }

  // Safe buffer-based Excel file operations for users.xlsx (Developer Only)
  function readUsersExcelFile(): StoredUser[] {
    if (!fs.existsSync(USERS_FILE_PATH)) {
      return [];
    }
    try {
      const buffer = fs.readFileSync(USERS_FILE_PATH);
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = wb.SheetNames.includes('Users') ? 'Users' : (wb.SheetNames[0] || 'Users');
      const ws = wb.Sheets[sheetName];
      if (!ws) return [];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];
      return rows.map(r => ({
        id: String(r['User ID'] || r.id || ''),
        name: String(r['Name'] || r.name || ''),
        role: (String(r['Role'] || r.role || '').toLowerCase().includes('main') ? 'main' : 'member') as 'main' | 'member',
        passwordHash: String(r['Password Hash'] || r.passwordHash || ''),
        salt: String(r['Salt'] || r.salt || ''),
        createdAt: String(r['Created At'] || r.createdAt || new Date().toISOString()),
        lastModified: String(r['Last Modified'] || r.lastModified || new Date().toISOString()),
      })).filter(u => u.id && u.name);
    } catch (err) {
      console.error('[Users Storage] Error reading users excel file:', err);
      return [];
    }
  }

  function writeUsersExcelFile(users: StoredUser[], payload?: any) {
    let effPayload = payload;
    if (!effPayload) {
      if (fs.existsSync(EXCEL_FILE_PATH)) {
        try {
          const wb = readExcelDatabaseFile();
          effPayload = parseExcelWorkbook(wb, getEffectiveDefaultSettings());
        } catch {
          effPayload = {
            expenses: getInitialExpenses(),
            settlements: [],
            settings: getEffectiveDefaultSettings(),
          };
        }
      } else {
        effPayload = {
          expenses: getInitialExpenses(),
          settlements: [],
          settings: getEffectiveDefaultSettings(),
        };
      }
    }

    const wb = buildUsersExcelWorkbook(users, effPayload);
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const tmpPath = `${USERS_FILE_PATH}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, USERS_FILE_PATH);
    usersVersion = Date.now();
  }

  function getEffectiveDefaultSettings(): AppSettings {
    const users = readUsersExcelFile();
    if (users && users.length > 0) {
      const mainU = users.find(u => u.role === 'main') || users[0];
      const members = users.map(u => ({ id: u.id, name: u.name }));
      return {
        ...DEFAULT_SETTINGS,
        mainUserId: mainU.id,
        myName: mainU.name,
        members,
      };
    }
    return DEFAULT_SETTINGS;
  }

  function ensureExpensesMembersMigrated() {
    if (!fs.existsSync(EXCEL_FILE_PATH)) return;
    try {
      const effSettings = getEffectiveDefaultSettings();
      const wb = readExcelDatabaseFile();
      const parsed = parseExcelWorkbook(wb, effSettings);

      let modified = false;
      for (const exp of parsed.expenses) {
        const normPayer = normalizePayerId(exp.paidBy, parsed.settings.mainUserId, parsed.settings.members);
        if (normPayer !== exp.paidBy) {
          exp.paidBy = normPayer;
          modified = true;
        }
        if (exp.splitAmong && exp.splitAmong.length > 0) {
          const normSplits = exp.splitAmong.map(id => normalizePayerId(id, parsed.settings.mainUserId, parsed.settings.members));
          if (JSON.stringify(normSplits) !== JSON.stringify(exp.splitAmong)) {
            exp.splitAmong = normSplits;
            modified = true;
          }
        }
      }

      for (const set of parsed.settlements) {
        const normPayer = normalizePayerId(set.paidBy, parsed.settings.mainUserId, parsed.settings.members);
        if (normPayer !== set.paidBy) {
          set.paidBy = normPayer;
          modified = true;
        }
        if (set.paidTo) {
          const normReceiver = normalizePayerId(set.paidTo, parsed.settings.mainUserId, parsed.settings.members);
          if (normReceiver !== set.paidTo) {
            set.paidTo = normReceiver;
            modified = true;
          }
        }
      }

      if (wb.SheetNames.includes('Members') || wb.SheetNames.includes('Summary')) {
        modified = true;
      }

      if (modified) {
        const cleanWb = buildExcelWorkbook(parsed);
        writeExcelDatabaseFile(cleanWb);
        console.log('[Excel Storage] Successfully cleaned and migrated expenses.xlsx (Expenses & Settlements only)');
      }
    } catch (e) {
      console.warn('[Excel Storage] Member migration warning:', e);
    }
  }

  // Initialize users database if not exists
  function initializeUsersIfNotExists() {
    if (!fs.existsSync(USERS_FILE_PATH)) {
      const nowISO = new Date().toISOString();
      const defaultUsers: StoredUser[] = DEFAULT_SETTINGS.members.map((m, idx) => {
        const { hash, salt } = hashPassword('1234');
        return {
          id: m.id,
          name: m.name,
          role: idx === 0 ? 'main' : 'member',
          passwordHash: hash,
          salt,
          createdAt: nowISO,
          lastModified: nowISO,
        };
      });
      writeUsersExcelFile(defaultUsers);
      console.log(`[Users Storage] Initialized master users database file at: ${USERS_FILE_PATH}`);
    }
  }

  // Initialize Excel database if not exists or reset for dry run
  function initializeExcelIfNotExists() {
    let settings = getEffectiveDefaultSettings();
    if (fs.existsSync(EXCEL_FILE_PATH)) {
      try {
        const existingWb = readExcelDatabaseFile();
        const parsed = parseExcelWorkbook(existingWb, settings);
        settings = parsed.settings || settings;
      } catch (err) {
        console.warn('[Excel Storage] Could not read previous settings:', err);
      }
    }
    const initialPayload = {
      expenses: [],
      settlements: [],
      settings,
    };
    const wb = buildExcelWorkbook(initialPayload);
    writeExcelDatabaseFile(wb);
    console.log(`[Excel Storage] Initialized clean database file at: ${EXCEL_FILE_PATH}`);
  }

  initializeUsersIfNotExists();
  initializeExcelIfNotExists();
  ensureExpensesMembersMigrated();

  // API 1: Health & Storage Engine Check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      storageEngine: 'Excel (.xlsx)',
      expensesPath: 'data/expenses.xlsx',
      usersPath: 'data/users.xlsx',
      expensesVersion,
      usersVersion,
    });
  });

  // API 2: Lightweight sync version check for real-time collaboration
  app.get('/api/sync/version', (req, res) => {
    res.json({
      expensesVersion,
      usersVersion,
    });
  });

  // API 3: Read Excel Database Data
  app.get('/api/excel/data', (req, res) => {
    try {
      initializeExcelIfNotExists();
      const wb = readExcelDatabaseFile();
      const data = parseExcelWorkbook(wb, getEffectiveDefaultSettings());
      const stat = fs.statSync(EXCEL_FILE_PATH);

      res.json({
        success: true,
        data,
        version: expensesVersion,
        meta: {
          filePath: 'data/expenses.xlsx',
          sizeBytes: stat.size,
          lastModified: stat.mtime.toISOString(),
          totalExpenses: data.expenses.length,
          totalSettlements: data.settlements.length,
        },
      });
    } catch (err: any) {
      console.error('[Excel Storage] Error reading excel file:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to read Excel file' });
    }
  });

  // API 4: Save / Sync Data to Excel Database
  app.post('/api/excel/save', (req, res) => {
    try {
      const { expenses, settlements, settings } = req.body;
      if (!expenses || !Array.isArray(expenses)) {
        return res.status(400).json({ success: false, error: 'Invalid expenses payload' });
      }

      const payload = {
        expenses,
        settlements: Array.isArray(settlements) ? settlements : [],
        settings: settings || DEFAULT_SETTINGS,
      };

      const wb = buildExcelWorkbook(payload);
      writeExcelDatabaseFile(wb);
      const stat = fs.statSync(EXCEL_FILE_PATH);

      // If member names changed, sync to users.xlsx
      if (settings?.members && Array.isArray(settings.members)) {
        try {
          const storedUsers = readUsersExcelFile();
          let usersChanged = false;
          for (const m of settings.members) {
            const u = storedUsers.find(su => su.id === m.id);
            if (u && u.name !== m.name) {
              u.name = m.name;
              u.lastModified = new Date().toISOString();
              usersChanged = true;
            }
          }
          if (usersChanged) {
            writeUsersExcelFile(storedUsers);
            console.log('[Users Storage] Synchronized updated member names to users.xlsx');
          }
        } catch (uErr) {
          console.warn('[Users Storage] Notice syncing member names to users.xlsx:', uErr);
        }
      }

      res.json({
        success: true,
        savedAt: new Date().toISOString(),
        version: expensesVersion,
        sizeBytes: stat.size,
        filePath: 'data/expenses.xlsx',
      });
    } catch (err: any) {
      console.error('[Excel Storage] Error saving to excel file:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to save to Excel file' });
    }
  });

  // API 5: Download Excel File directly for Microsoft Excel / Google Sheets
  app.get('/api/excel/download', (req, res) => {
    try {
      initializeExcelIfNotExists();
      const filename = `expenses_${new Date().toISOString().split('T')[0]}.xlsx`;
      res.download(EXCEL_FILE_PATH, filename, (err) => {
        if (err) {
          console.error('[Excel Storage] Error sending file for download:', err);
        }
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 5b: Download Blank Excel Template
  app.get('/api/excel/template', (req, res) => {
    try {
      const wb = buildBlankExcelTemplate(getEffectiveDefaultSettings());
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="expenses_template.xlsx"');
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 6: Upload / Replace Excel file from user
  app.post('/api/excel/upload', (req, res) => {
    try {
      const { base64Data } = req.body;
      if (!base64Data) {
        return res.status(400).json({ success: false, error: 'Missing base64Data' });
      }

      const buffer = Buffer.from(base64Data, 'base64');
      const wb = XLSX.read(buffer, { type: 'buffer' });
      const parsed = parseExcelWorkbook(wb, DEFAULT_SETTINGS);

      // Write parsed cleanly formatted back to master file
      const cleanWb = buildExcelWorkbook(parsed);
      writeExcelDatabaseFile(cleanWb);

      res.json({
        success: true,
        message: 'Excel database successfully imported and replaced',
        data: parsed,
        version: expensesVersion,
      });
    } catch (err: any) {
      console.error('[Excel Storage] Error uploading Excel file:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to parse Excel file' });
    }
  });

  // ==========================================
  // USERS EXCEL DATABASE APIS (Developer Only File)
  // ==========================================

  let currentActiveUserId: string | null = null;

  // API 7: Check users configuration status
  app.get('/api/users/status', (req, res) => {
    try {
      const users = readUsersExcelFile();
      if (users.length === 0) {
        return res.json({
          configured: false,
          mainUserId: '',
          developerUserId: '',
          developerName: '',
          members: [],
          version: usersVersion,
        });
      }

      // The first main registered user is designated as the developer
      const developerUser = users.find(u => u.role === 'main') || users[0];
      const mainUser = (currentActiveUserId && users.find(u => u.id === currentActiveUserId)) || developerUser;

      res.json({
        configured: true,
        mainUserId: mainUser.id,
        developerUserId: developerUser.id,
        developerName: developerUser.name,
        members: users.map(u => ({
          id: u.id,
          name: u.name,
          role: u.role,
          isDeveloper: u.id === developerUser.id,
        })),
        version: usersVersion,
      });
    } catch (err: any) {
      res.status(500).json({ configured: false, error: err.message });
    }
  });

  // API 8: First-time setup or configuration of users
  app.post('/api/users/setup', (req, res) => {
    try {
      const { mainUser, members } = req.body;
      if (!mainUser || !mainUser.name || !mainUser.name.trim()) {
        return res.status(400).json({ success: false, error: 'Main username is required' });
      }

      const cleanMainName = mainUser.name.trim();
      const storedUsers: StoredUser[] = [];
      const mainId = generate5DigitMemberId(storedUsers);
      const mainPass = String(mainUser.password || '1234');
      const { hash: mainHash, salt: mainSalt } = hashPassword(mainPass);

      const nowISO = new Date().toISOString();
      storedUsers.push({
        id: mainId,
        name: cleanMainName,
        role: 'main',
        passwordHash: mainHash,
        salt: mainSalt,
        createdAt: nowISO,
        lastModified: nowISO,
      });

      // Add members if provided
      if (Array.isArray(members)) {
        for (let i = 0; i < members.length; i++) {
          const m = members[i];
          const mName = (m.name || '').trim();
          if (!mName) continue;
          const mId = generate5DigitMemberId(storedUsers);
          const mPass = String(m.password || mainPass);
          const { hash, salt } = hashPassword(mPass);
          storedUsers.push({
            id: mId,
            name: mName,
            role: 'member',
            passwordHash: hash,
            salt,
            createdAt: nowISO,
            lastModified: nowISO,
          });
        }
      }

      // Write users.xlsx
      writeUsersExcelFile(storedUsers);

      // Also sync user members into expenses.xlsx settings
      const newMembers = storedUsers.map(u => ({ id: u.id, name: u.name }));
      try {
        initializeExcelIfNotExists();
        const wb = readExcelDatabaseFile();
        const parsed = parseExcelWorkbook(wb, DEFAULT_SETTINGS);
        parsed.settings.members = newMembers;
        parsed.settings.mainUserId = mainId;
        parsed.settings.myName = cleanMainName;
        parsed.settings.currencySymbol = req.body.currencySymbol || 'RM';
        parsed.settings.currencyCode = req.body.currencyCode || 'MYR';
        const cleanWb = buildExcelWorkbook(parsed);
        writeExcelDatabaseFile(cleanWb);
      } catch (syncErr) {
        console.warn('Could not sync settings into expenses.xlsx:', syncErr);
      }

      res.json({
        success: true,
        mainUserId: mainId,
        members: newMembers,
        version: usersVersion,
      });
    } catch (err: any) {
      console.error('[Users Setup Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to setup users' });
    }
  });

  // API 9: Verify user password when switching active main user
  app.post('/api/users/verify', (req, res) => {
    try {
      const { userId, password } = req.body;
      if (!userId || password === undefined) {
        return res.status(400).json({ valid: false, error: 'User ID and password required' });
      }

      const users = readUsersExcelFile();
      const user = users.find(u => u.id === userId);
      if (!user) {
        // If users.xlsx doesn't have this user yet, fallback to true or reject
        return res.status(404).json({ valid: false, error: 'User not found' });
      }

      const isValid = verifyPassword(String(password), user.passwordHash, user.salt);
      if (isValid) {
        currentActiveUserId = userId;
        return res.json({ valid: true });
      } else {
        return res.json({ valid: false, error: 'Incorrect password' });
      }
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message });
    }
  });

  // API 9b: Set active main user
  app.post('/api/users/set-active', (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'User ID is required' });
      }
      currentActiveUserId = userId;

      // Update main user in expenses.xlsx Settings & Summary
      try {
        if (fs.existsSync(EXCEL_FILE_PATH)) {
          const users = readUsersExcelFile();
          const targetU = users.find(u => u.id === userId);
          if (targetU) {
            const wb = readExcelDatabaseFile();
            const parsed = parseExcelWorkbook(wb, getEffectiveDefaultSettings());
            parsed.settings.mainUserId = targetU.id;
            parsed.settings.myName = targetU.name;
            const updatedWb = buildExcelWorkbook(parsed);
            writeExcelDatabaseFile(updatedWb);
          }
        }
      } catch (syncErr) {
        console.warn('[Excel Storage] Could not update active user in expenses.xlsx:', syncErr);
      }

      res.json({ success: true, activeUserId: userId });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 10: Add new user member with encrypted password
  app.post('/api/users/add-member', (req, res) => {
    try {
      const { name, password } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ success: false, error: 'Member name is required' });
      }

      const users = readUsersExcelFile();
      const cleanName = name.trim();
      const newId = generate5DigitMemberId(users);
      const pass = String(password || '1234');
      const { hash, salt } = hashPassword(pass);
      const nowISO = new Date().toISOString();

      users.push({
        id: newId,
        name: cleanName,
        role: 'member',
        passwordHash: hash,
        salt,
        createdAt: nowISO,
        lastModified: nowISO,
      });

      writeUsersExcelFile(users);

      // Sync into expenses.xlsx settings
      try {
        const wb = readExcelDatabaseFile();
        const parsed = parseExcelWorkbook(wb, DEFAULT_SETTINGS);
        parsed.settings.members = users.map(u => ({ id: u.id, name: u.name }));
        writeExcelDatabaseFile(buildExcelWorkbook(parsed));
      } catch (err) {
        console.warn('Could not sync member to expenses.xlsx:', err);
      }

      res.json({
        success: true,
        member: { id: newId, name: cleanName, role: 'member' },
        version: usersVersion,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // API 11: Developer-Only download of users.xlsx (Only first main user / developer can access)
  app.get('/api/users/excel/download', (req, res) => {
    try {
      let users = readUsersExcelFile();
      if (!users || users.length === 0) {
        initializeUsersIfNotExists();
        users = readUsersExcelFile();
      }

      const developerUser = users.find(u => u.role === 'main') || users[0];
      const requestingUserId = (req.query.requestingUserId as string)?.trim();

      // Normalize check: allow if requesting user matches developer ID or developer legacy alias
      if (requestingUserId && developerUser) {
        const normRequestingId = normalizePayerId(
          requestingUserId,
          developerUser.id,
          users.map(u => ({ id: u.id, name: u.name }))
        );
        if (normRequestingId !== developerUser.id && requestingUserId !== developerUser.id && requestingUserId !== 'u_huixin') {
          return res.status(403).json({ error: 'Access restricted: Only the developer can view or download users.xlsx' });
        }
      }

      // Always compile and save fresh snapshot before download
      writeUsersExcelFile(users);

      if (!fs.existsSync(USERS_FILE_PATH)) {
        return res.status(404).json({ error: 'users.xlsx file could not be generated' });
      }

      const fileBuffer = fs.readFileSync(USERS_FILE_PATH);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="users.xlsx"');
      res.setHeader('Content-Length', fileBuffer.length);
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.send(fileBuffer);
    } catch (err: any) {
      console.error('[Users Storage] Error downloading users.xlsx:', err);
      res.status(500).json({ error: err.message || 'Server error while generating users.xlsx' });
    }
  });

  // ==========================================
  // CURRENCY EXCHANGE RATE & CONVERSION APIS
  // ==========================================

  let cachedRates: { base: string; rates: Record<string, number>; timestamp: number } | null = null;

  // Fallback exchange rates against MYR (Malaysian Ringgit)
  const FALLBACK_RATES_MYR: Record<string, number> = {
    MYR: 1.0,
    JPY: 38.57,
    USD: 0.226,
    SGD: 0.304,
    EUR: 0.205,
    GBP: 0.174,
    THB: 8.05,
    AUD: 0.345,
    KRW: 305.5,
    CNY: 1.63,
    IDR: 3650.0,
    TWD: 7.25,
    HKD: 1.76,
  };

  // API 12: Get live exchange rates from free public Exchange Rate API (open.er-api.com)
  app.get('/api/currency/rates', async (req, res) => {
    try {
      const base = String(req.query.base || 'MYR').toUpperCase();
      const now = Date.now();

      // Return cached rates if fresh (within 30 minutes) and matches requested base
      if (cachedRates && cachedRates.base === base && now - cachedRates.timestamp < 30 * 60 * 1000) {
        return res.json({
          success: true,
          base,
          rates: cachedRates.rates,
          cached: true,
          provider: 'open.er-api.com',
          lastUpdated: new Date(cachedRates.timestamp).toISOString(),
        });
      }

      try {
        const fetchRes = await fetch(`https://open.er-api.com/v6/latest/${base}`);
        if (fetchRes.ok) {
          const data: any = await fetchRes.json();
          if (data && data.rates) {
            cachedRates = {
              base,
              rates: data.rates,
              timestamp: now,
            };
            return res.json({
              success: true,
              base,
              rates: data.rates,
              cached: false,
              provider: 'open.er-api.com',
              lastUpdated: new Date().toISOString(),
            });
          }
        }
      } catch (networkErr) {
        console.warn('[Currency API] Public API network issue, using reference fallback:', networkErr);
      }

      // If base is MYR, return fallback directly
      if (base === 'MYR') {
        return res.json({
          success: true,
          base: 'MYR',
          rates: FALLBACK_RATES_MYR,
          cached: false,
          fallback: true,
          provider: 'Reference standard rates',
          lastUpdated: new Date().toISOString(),
        });
      }

      // Calculate relative rates from FALLBACK_RATES_MYR if base is another currency
      const baseToMyr = 1 / (FALLBACK_RATES_MYR[base] || 1);
      const derivedRates: Record<string, number> = {};
      for (const [code, myrRate] of Object.entries(FALLBACK_RATES_MYR)) {
        derivedRates[code] = parseFloat((myrRate * baseToMyr).toFixed(4));
      }
      derivedRates[base] = 1.0;

      res.json({
        success: true,
        base,
        rates: derivedRates,
        cached: false,
        fallback: true,
        provider: 'Reference standard rates',
        lastUpdated: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch currency rates' });
    }
  });

  // API 13: Recalculate & convert all expenses and settlements in expenses.xlsx to a new currency
  app.post('/api/currency/convert-database', (req, res) => {
    try {
      const { fromCurrency, toCurrency, rate, newSymbol, newCode } = req.body;
      const numRate = parseFloat(rate);
      if (isNaN(numRate) || numRate <= 0) {
        return res.status(400).json({ success: false, error: 'Valid positive exchange rate required' });
      }

      initializeExcelIfNotExists();
      const wb = readExcelDatabaseFile();
      const data = parseExcelWorkbook(wb, DEFAULT_SETTINGS);

      // Convert expenses
      const isZeroDecimal = toCurrency === 'JPY' || toCurrency === 'KRW';
      const roundVal = (v: number) => {
        const converted = v * numRate;
        return isZeroDecimal ? Math.round(converted) : Math.round(converted * 100) / 100;
      };

      data.expenses = data.expenses.map(exp => {
        const newAmount = roundVal(exp.amount);
        const newMyShare = exp.myShare !== undefined ? roundVal(exp.myShare) : undefined;
        const newFriendShare = exp.friendShare !== undefined ? roundVal(exp.friendShare) : undefined;
        return {
          ...exp,
          amount: newAmount,
          myShare: newMyShare,
          friendShare: newFriendShare,
        };
      });

      // Convert settlements
      data.settlements = data.settlements.map(set => ({
        ...set,
        amount: roundVal(set.amount),
      }));

      // Update settings
      if (!data.settings) data.settings = { ...DEFAULT_SETTINGS };
      data.settings.currencyCode = newCode || toCurrency;
      data.settings.currencySymbol = newSymbol || (newCode === 'JPY' ? '¥' : '$');

      // Write updated data back to expenses.xlsx
      const cleanWb = buildExcelWorkbook(data);
      writeExcelDatabaseFile(cleanWb);

      res.json({
        success: true,
        convertedCount: data.expenses.length,
        settlementsCount: data.settlements.length,
        rate: numRate,
        newCurrency: data.settings.currencyCode,
        newSymbol: data.settings.currencySymbol,
        updatedData: data,
        version: expensesVersion,
      });
    } catch (err: any) {
      console.error('[Currency Conversion Error]', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to convert database currency' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
