import React, { useRef, useState } from 'react';
import { X, FileSpreadsheet, Download, Upload, RefreshCw, CheckCircle2, AlertCircle, Database, FileText, FileDown, Cloud, Zap } from 'lucide-react';
import { Expense, Settlement, AppSettings } from '../types';
import { triggerExcelDownload, triggerExcelTemplateDownload, importExcelFile, triggerUsersExcelDownload } from '../utils/excelService';
import { replaceFirestoreWithExcelData, exportFirestoreToExcelFile } from '../lib/firebase';
import * as xlsxModule from 'xlsx';

const XLSX = (xlsxModule as any).default || xlsxModule;

interface ExcelDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  expenses: Expense[];
  settlements: Settlement[];
  settings: AppSettings;
  onDataImported: (data: { expenses: Expense[]; settlements: Settlement[]; settings: AppSettings }) => void;
  onReloadFromBackend: () => Promise<void>;
  isBackendConnected: boolean;
  isDeveloper?: boolean;
}

export const ExcelDatabaseModal: React.FC<ExcelDatabaseModalProps> = ({
  isOpen,
  onClose,
  expenses,
  settlements,
  settings,
  onDataImported,
  onReloadFromBackend,
  isBackendConnected,
  isDeveloper = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isDownloadingUsers, setIsDownloadingUsers] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleDownloadUsers = async () => {
    setIsDownloadingUsers(true);
    setMessage(null);
    try {
      await triggerUsersExcelDownload(settings.mainUserId);
      setMessage({ type: 'success', text: 'users.xlsx downloaded successfully!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to download users.xlsx' });
    } finally {
      setIsDownloadingUsers(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setMessage(null);
    try {
      // First try to export from live Firebase cloud database
      await exportFirestoreToExcelFile(settings);
      setMessage({ type: 'success', text: 'Live Firebase database exported and downloaded as Excel (.xlsx)!' });
    } catch (err) {
      console.warn('Direct Firestore export fallback:', err);
      // Fallback to local memory / server builder
      try {
        triggerExcelDownload({ expenses, settlements, settings });
        setMessage({ type: 'success', text: 'Excel (.xlsx) database file generated and downloaded!' });
      } catch (fallbackErr: any) {
        setMessage({ type: 'error', text: fallbackErr.message || 'Failed to download Excel file' });
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadTemplate = () => {
    try {
      triggerExcelTemplateDownload(settings);
      setMessage({ type: 'success', text: 'Blank Excel template (expenses_template.xlsx) downloaded!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to download blank template' });
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setMessage(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: 'array' });

      // Wipe old data and persist new Excel workbook into Firebase Firestore
      const parsed = await replaceFirestoreWithExcelData(wb, settings);
      
      // Update local state and trigger app refresh
      onDataImported(parsed);
      
      setMessage({
        type: 'success',
        text: `Successfully replaced database with "${file.name}"! Old data cleared. Loaded ${parsed.expenses.length} expenses and ${parsed.settlements.length} settlements synchronized across all devices in real-time.`,
      });
    } catch (err: any) {
      console.error('Excel upload error:', err);
      // Fallback to standard importer if cloud fails
      try {
        const parsed = await importExcelFile(file, settings);
        onDataImported(parsed);
        setMessage({
          type: 'success',
          text: `Loaded ${parsed.expenses.length} expenses and ${parsed.settlements.length} settlements from "${file.name}".`,
        });
      } catch (fallbackErr: any) {
        setMessage({ type: 'error', text: `Failed to import Excel file: ${fallbackErr.message}` });
      }
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReload = async () => {
    setIsReloading(true);
    setMessage(null);
    try {
      await onReloadFromBackend();
      setMessage({ type: 'success', text: 'Reloaded latest data from expenses.xlsx on server!' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Could not reload from server' });
    } finally {
      setIsReloading(false);
    }
  };

  const personalExpensesCount = expenses.filter(e => e.expenseScope === 'personal' || e.splitType === 'personal').length;
  const sharedExpensesCount = expenses.length - personalExpensesCount;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity">
      <div
        id="excel-database-modal"
        className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl h-[88vh] sm:h-[85vh] max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-200"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Excel & Firebase Cloud Database</h2>
              <p className="text-[11px] text-slate-500">Real-time sync across all friends & devices</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Status Banner */}
          <div className="p-3.5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs">
                <Cloud className="w-4 h-4 text-emerald-600 shrink-0 animate-pulse" />
                <span>Firebase Cloud Firestore Active</span>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                <Zap className="w-3 h-3 text-emerald-600" />
                Live Multi-User
              </span>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              All expenses, settlements, and member balances automatically synchronize in <strong>real time</strong> across all shared link users. You can download or upload complete <strong>Excel (.xlsx)</strong> files at any time.
            </p>
          </div>

          {/* Alert / Feedback message */}
          {message && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <span className="text-xs font-medium">{message.text}</span>
            </div>
          )}

          {/* Workbook Contents Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>Current Cloud Database Records</span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Shared
                </span>
                <span className="text-base font-extrabold text-blue-600">
                  {sharedExpensesCount}
                </span>
                <span className="text-[9px] text-slate-400 block">expenses</span>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Personal
                </span>
                <span className="text-base font-extrabold text-emerald-600">
                  {personalExpensesCount}
                </span>
                <span className="text-[9px] text-slate-400 block">my items</span>
              </div>

              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                  Settlements
                </span>
                <span className="text-base font-extrabold text-slate-800">
                  {settlements.length}
                </span>
                <span className="text-[9px] text-slate-400 block">records</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between border-t border-slate-200/60">
              <span>File format: <strong>Microsoft Excel (.xlsx)</strong></span>
              <span>Sheets: <strong>4 synchronized tabs</strong></span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            {/* Download Full Database */}
            <button
              type="button"
              disabled={isDownloading}
              onClick={handleDownload}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloading ? 'Generating Excel Spreadsheet...' : 'Download Current Database (.xlsx)'}</span>
            </button>

            {/* Download Blank Template */}
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center gap-2 active:scale-98 transition-all"
            >
              <FileDown className="w-4 h-4 text-emerald-600" />
              <span>Download Blank Template (No Data)</span>
            </button>

            {/* Upload / Replace Button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-slate-600" />
              <span>{isImporting ? 'Clearing Old & Saving Excel to Cloud...' : 'Upload Excel File (Replaces All Data)'}</span>
            </button>

            {/* Reload from server button */}
            {isBackendConnected && (
              <button
                type="button"
                disabled={isReloading}
                onClick={handleReload}
                className="w-full py-2 px-4 rounded-xl font-medium text-xs text-slate-600 hover:bg-slate-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin text-emerald-600' : ''}`} />
                <span>{isReloading ? 'Reloading...' : 'Reload from expenses.xlsx backup'}</span>
              </button>
            )}
          </div>

          {/* Developer-Only Users Excel File */}
          {isDeveloper && (
            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[11px] text-amber-900 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-amber-700" />
                  Developer Only: users.xlsx
                </span>
                <span className="text-[10px] bg-amber-200/60 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                  Credentials & Passwords
                </span>
              </div>
              <p className="text-[10px] text-amber-800/90 leading-relaxed">
                Contains user passkeys, credentials, and member roles saved in a spreadsheet file (<code className="font-semibold text-amber-950">data/users.xlsx</code>).
              </p>
              <button
                type="button"
                disabled={isDownloadingUsers}
                onClick={handleDownloadUsers}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs disabled:opacity-50"
              >
                <Download className={`w-3 h-3 ${isDownloadingUsers ? 'animate-bounce' : ''}`} />
                <span>{isDownloadingUsers ? 'Preparing users.xlsx...' : 'Download users.xlsx (Developer)'}</span>
              </button>
            </div>
          )}

          {/* Helpful Tips */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-[11px] text-slate-600">
            <p className="font-semibold text-slate-800 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Excel Structure & Blank Template
            </p>
            <ul className="list-disc pl-4 space-y-0.5 text-[10px]">
              <li><strong>Expenses tab:</strong> ID, Date, Category, Scope, Original Amount, Currency, Total Amount, Paid By, Split Among, Notes (recorded when category is <em>Others</em>).</li>
              <li><strong>Settlements tab:</strong> Log of all settled payments between group members.</li>
              <li><strong>Members & Settings tab:</strong> Group members and default currency configuration.</li>
              <li><strong>Upload behavior:</strong> When you upload an Excel file, old cloud database data is cleared and replaced immediately across all users.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};


