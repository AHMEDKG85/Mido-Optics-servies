import React, { useRef } from 'react';
import { User } from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Database,
  ExternalLink,
  LogIn,
  LogOut,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { LENS_INVENTORY_SITE_URL } from '../lib/lensInventory';
import { LensInventorySnapshot } from '../types/optics';
import { AuthErrorSummary } from '../utils/optics';

interface LensInventoryPanelProps {
  lensUser: User | null;
  inventory: LensInventorySnapshot | null;
  summary: { sheetCount: number; stockedPowersCount: number; totalUnits: number };
  connecting: boolean;
  authError: AuthErrorSummary | null;
  syncError: string | null;
  firebaseProjectId: string;
  onConnectCloud: () => Promise<boolean>;
  onDisconnectCloud: () => Promise<void>;
  onImportJsonText: (jsonText: string) => LensInventorySnapshot;
  onClearInventory: () => void;
  onDismissError: () => void;
  onToast: (msg: string) => void;
}

export const LensInventoryPanel: React.FC<LensInventoryPanelProps> = ({
  lensUser,
  inventory,
  summary,
  connecting,
  authError,
  syncError,
  firebaseProjectId,
  onConnectCloud,
  onDisconnectCloud,
  onImportJsonText,
  onClearInventory,
  onDismissError,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleConnect = async () => {
    const ok = await onConnectCloud();
    if (ok) {
      onToast('تم ربط مخزن العدسات السحابي بنجاح');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = onImportJsonText(String(reader.result || ''));
        onToast(
          `تم استيراد بيانات مخزن العدسات (${Object.keys(parsed.sheets).length} صفحات)`
        );
      } catch (err) {
        onToast(err instanceof Error ? err.message : 'ملف مخزن العدسات غير صالح');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyHostname = async (hostname: string) => {
    try {
      await navigator.clipboard.writeText(hostname);
      onToast(`تم نسخ النطاق: ${hostname}`);
    } catch {
      onToast(hostname);
    }
  };

  return (
    <section
      aria-label="ربط مخزن العدسات"
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15232f] p-4 sm:p-5 space-y-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-base font-extrabold flex items-center gap-2">
            <Database className="w-5 h-5 text-[#c9a24b]" />
            <span>الربط التلقائي مع مخزن العدسات (Lens Inventory)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            يتحقق البرنامج تلقائياً من مقاسات العين اليمين (R) والشمال (L) في مخزن العدسات لإخبارك فوراً إن كانت متوفرة أم تحتاج لطلبها من الشركة.
          </p>
        </div>

        <a
          href={LENS_INVENTORY_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <ExternalLink className="w-3.5 h-3.5 text-[#c9a24b]" />
          <span>فتح موقع مخزن العدسات</span>
        </a>
      </div>

      {/* Status + Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f3f9fd] dark:bg-[#1b3042]/70 border border-slate-200/80 dark:border-slate-700/70 px-3.5 py-3">
        <div className="text-xs sm:text-sm space-y-0.5">
          {inventory ? (
            <div className="flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {inventory.source === 'cloud' && lensUser
                  ? `متصل سحابياً (${lensUser.email || 'حساب مخزن العدسات'})`
                  : 'مربوط عبر نسخة مخزن العدسات'}
              </span>
            </div>
          ) : (
            <div className="font-bold text-slate-700 dark:text-slate-200">
              المخزن غير مربوط بعد
            </div>
          )}
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {inventory
              ? `${summary.sheetCount} صفحات عدسات · ${summary.stockedPowersCount} مقاس متوفر · ${summary.totalUnits} قطعة`
              : 'اربط بحساب Google نفسه المستخدم في lens-inventory.vercel.app أو استورد ملف النسخة الاحتياطية (.json).'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lensUser ? (
            <button
              type="button"
              onClick={() => void onDisconnectCloud()}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-[#c9a24b]" />
              <span>فصل حساب المخزن</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={connecting}
              onClick={() => void handleConnect()}
              className="min-h-[40px] px-4 py-1.5 rounded-xl bg-gradient-to-br from-[#d9b65c] to-[#a8832f] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{connecting ? 'جاري الربط...' : 'ربط سحابي بـ Lens Inventory'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#15232f] text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-[#c9a24b] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-[#c9a24b]" />
            <span>استيراد ملف المخزن (.json)</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          {inventory && !lensUser && (
            <button
              type="button"
              onClick={() => {
                onClearInventory();
                onToast('تم مسح نسخة المخزن المحلية');
              }}
              aria-label="مسح نسخة مخزن العدسات"
              title="مسح نسخة المخزن"
              className="min-h-[40px] min-w-[40px] px-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-400 inline-flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Actionable Error Banner for Lens Inventory */}
      {(authError || syncError) && (
        <div
          role="alert"
          className="rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/45 px-3.5 py-2.5 text-xs text-rose-900 dark:text-rose-200 flex flex-wrap items-center justify-between gap-2"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="font-bold">
                {authError ? authError.title : 'تعذر مزامنة مخزن العدسات السحابي'}
              </p>
              <p className="opacity-90 break-words">
                {authError
                  ? authError.isUnauthorizedDomain
                    ? `${authError.details} (في مشروع مخزن العدسات: ${firebaseProjectId}) — أو يمكنك استخدام «استيراد ملف المخزن (.json)» فوراً.`
                    : authError.details
                  : syncError}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {authError?.isUnauthorizedDomain && authError.hostname && (
              <button
                type="button"
                onClick={() => void handleCopyHostname(authError.hostname)}
                className="min-h-[34px] px-3 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ النطاق</span>
              </button>
            )}
            <button
              type="button"
              onClick={onDismissError}
              aria-label="إغلاق التنبيه"
              className="min-h-[34px] min-w-[34px] rounded-lg hover:bg-rose-200/60 dark:hover:bg-rose-900/50 grid place-items-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
